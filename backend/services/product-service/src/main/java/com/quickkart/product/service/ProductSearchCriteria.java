package com.quickkart.product.service;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.Map;

/**
 * Validated, normalised catalog query. Normalising (trim, lower-case, upper-case category,
 * canonical price strings) matters for two reasons:
 *  1. invalid input fails fast with a 400 instead of reaching the database, and
 *  2. equivalent requests ("Phone " vs "phone") produce the SAME Redis cache key.
 */
public final class ProductSearchCriteria {

    public static final int DEFAULT_SIZE = 24;
    public static final int MAX_SIZE = 48;
    public static final int MAX_PAGE = 10_000;
    public static final int MAX_QUERY_LENGTH = 100;
    private static final BigDecimal MAX_PRICE = new BigDecimal("10000000");

    /**
     * Whitelisted sort keys → database ordering. "id" is always the final tie-breaker so pages never
     * overlap or skip items. An UNSORTED entry means the ordering is applied inside the
     * Specification instead (see {@link #nullsLastDescField()}).
     */
    private static final Map<String, Sort> SORTS = Map.of(
            "featured", Sort.by(Sort.Order.asc("id")),
            "price-asc", Sort.by(Sort.Order.asc("price"), Sort.Order.asc("id")),
            "price-desc", Sort.by(Sort.Order.desc("price"), Sort.Order.asc("id")),
            "rating-desc", Sort.unsorted(),
            "discount-desc", Sort.unsorted(),
            "popular", Sort.unsorted(),
            "name", Sort.by(Sort.Order.asc("name"), Sort.Order.asc("id")),
            "newest", Sort.by(Sort.Order.desc("id"))
    );

    /**
     * PostgreSQL puts NULLs FIRST for DESC, which would show unrated products above 5-star ones.
     * Hibernate's Criteria API can't express "NULLS LAST", so these two sorts are ordered by
     * COALESCE(field, -1) DESC inside the Specification. Returns null for every other sort.
     */
    public String nullsLastDescField() {
        return switch (sort) {
            case "rating-desc" -> "rating";
            case "discount-desc" -> "discountPercentage";
            case "popular" -> "reviewCount";
            default -> null;
        };
    }

    private final String query;
    private final String category;
    private final BigDecimal minPrice;
    private final BigDecimal maxPrice;
    private final String sort;
    private final int page;
    private final int size;

    private ProductSearchCriteria(String query, String category, BigDecimal minPrice, BigDecimal maxPrice,
                                  String sort, int page, int size) {
        this.query = query;
        this.category = category;
        this.minPrice = minPrice;
        this.maxPrice = maxPrice;
        this.sort = sort;
        this.page = page;
        this.size = size;
    }

    public static ProductSearchCriteria of(String q, String category, BigDecimal minPrice, BigDecimal maxPrice,
                                           String sort, Integer page, Integer size) {
        String query = blankToNull(q);
        if (query != null) {
            if (query.length() > MAX_QUERY_LENGTH)
                throw new IllegalArgumentException("Search text must be at most " + MAX_QUERY_LENGTH + " characters");
            query = query.toLowerCase(Locale.ROOT);
        }
        String cat = blankToNull(category);
        if (cat != null) {
            if (cat.length() > 60) throw new IllegalArgumentException("Category is too long");
            cat = cat.toUpperCase(Locale.ROOT);
            if ("ALL".equals(cat)) cat = null;
        }
        if (minPrice != null && (minPrice.signum() < 0 || minPrice.compareTo(MAX_PRICE) > 0))
            throw new IllegalArgumentException("minPrice must be between 0 and " + MAX_PRICE.toPlainString());
        if (maxPrice != null && (maxPrice.signum() < 0 || maxPrice.compareTo(MAX_PRICE) > 0))
            throw new IllegalArgumentException("maxPrice must be between 0 and " + MAX_PRICE.toPlainString());
        if (minPrice != null && maxPrice != null && minPrice.compareTo(maxPrice) > 0)
            throw new IllegalArgumentException("minPrice must not be greater than maxPrice");

        String sortKey = blankToNull(sort) == null ? "featured" : sort.trim().toLowerCase(Locale.ROOT);
        if (!SORTS.containsKey(sortKey))
            throw new IllegalArgumentException("Unsupported sort. Allowed: " + String.join(", ", SORTS.keySet()));

        int pageNumber = page == null ? 0 : page;
        int pageSize = size == null ? DEFAULT_SIZE : size;
        if (pageNumber < 0 || pageNumber > MAX_PAGE) throw new IllegalArgumentException("page must be between 0 and " + MAX_PAGE);
        if (pageSize < 1 || pageSize > MAX_SIZE) throw new IllegalArgumentException("size must be between 1 and " + MAX_SIZE);

        return new ProductSearchCriteria(query, cat, strip(minPrice), strip(maxPrice), sortKey, pageNumber, pageSize);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static BigDecimal strip(BigDecimal value) {
        return value == null ? null : value.stripTrailingZeros();
    }

    public Pageable pageable() {
        return PageRequest.of(page, size, SORTS.get(sort));
    }

    /** Deterministic cache key built only from normalised values. */
    public String cacheKey() {
        return "q=" + (query == null ? "" : query)
                + "|c=" + (category == null ? "" : category)
                + "|min=" + (minPrice == null ? "" : minPrice.toPlainString())
                + "|max=" + (maxPrice == null ? "" : maxPrice.toPlainString())
                + "|s=" + sort + "|p=" + page + "|n=" + size;
    }

    public String query() { return query; }
    public String category() { return category; }
    public BigDecimal minPrice() { return minPrice; }
    public BigDecimal maxPrice() { return maxPrice; }
    public String sort() { return sort; }
    public int page() { return page; }
    public int size() { return size; }
}

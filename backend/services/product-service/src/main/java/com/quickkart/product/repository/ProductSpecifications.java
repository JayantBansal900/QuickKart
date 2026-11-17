package com.quickkart.product.repository;

import com.quickkart.product.entity.Product;
import com.quickkart.product.service.ProductSearchCriteria;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;

/**
 * Builds the WHERE clause for catalog search from optional filters. Only the filters that were
 * supplied become predicates, and every value is a bound parameter (no string-built SQL).
 */
public final class ProductSpecifications {

    private static final char ESCAPE = '\\';

    private ProductSpecifications() {
    }

    public static Specification<Product> matching(ProductSearchCriteria criteria) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (criteria.query() != null) {
                // Escape % and _ so a user typing "50%" searches for the literal text.
                String pattern = "%" + escapeLike(criteria.query()) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern, ESCAPE),
                        cb.like(cb.lower(cb.coalesce(root.get("brand"), "")), pattern, ESCAPE),
                        cb.like(cb.lower(cb.coalesce(root.get("description"), "")), pattern, ESCAPE),
                        cb.like(cb.lower(cb.coalesce(root.get("category"), "")), pattern, ESCAPE)
                ));
            }
            if (criteria.category() != null) {
                predicates.add(cb.equal(cb.upper(root.get("category")), criteria.category()));
            }
            if (criteria.minPrice() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("price"), criteria.minPrice()));
            }
            if (criteria.maxPrice() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("price"), criteria.maxPrice()));
            }

            // Ordering for "nulls last" sorts. Skipped for the COUNT query that pagination also runs.
            String nullsLastField = criteria.nullsLastDescField();
            boolean isCountQuery = Long.class.equals(query.getResultType()) || long.class.equals(query.getResultType());
            if (nullsLastField != null && !isCountQuery) {
                query.orderBy(
                        cb.desc(cb.coalesce(root.<Double>get(nullsLastField), -1.0)),
                        cb.asc(root.get("id")));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}

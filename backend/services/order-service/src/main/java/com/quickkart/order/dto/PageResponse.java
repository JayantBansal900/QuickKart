package com.quickkart.order.dto;

import org.springframework.data.domain.Page;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/**
 * Stable JSON shape for paginated results. We don't serialise Spring's PageImpl directly: its
 * JSON layout is not a stable contract (Spring Boot warns about it) and it is awkward to cache.
 *
 * Intentionally a plain mutable class (not a record/final class) with an ArrayList, so the Redis
 * JSON serializer can store type information and read it back.
 */
public class PageResponse<T> implements Serializable {

    private static final long serialVersionUID = 1L;

    private List<T> content = new ArrayList<>();
    private int page;
    private int size;
    private long totalElements;
    private int totalPages;
    private boolean last;

    public PageResponse() {
    }

    public static <E, T> PageResponse<T> from(Page<E> page, Function<E, T> mapper) {
        PageResponse<T> response = new PageResponse<>();
        response.content = new ArrayList<>(page.getContent().stream().map(mapper).toList());
        response.page = page.getNumber();
        response.size = page.getSize();
        response.totalElements = page.getTotalElements();
        response.totalPages = page.getTotalPages();
        response.last = page.isLast();
        return response;
    }

    public List<T> getContent() { return content; }
    public void setContent(List<T> content) { this.content = content == null ? new ArrayList<>() : new ArrayList<>(content); }
    public int getPage() { return page; }
    public void setPage(int page) { this.page = page; }
    public int getSize() { return size; }
    public void setSize(int size) { this.size = size; }
    public long getTotalElements() { return totalElements; }
    public void setTotalElements(long totalElements) { this.totalElements = totalElements; }
    public int getTotalPages() { return totalPages; }
    public void setTotalPages(int totalPages) { this.totalPages = totalPages; }
    public boolean isLast() { return last; }
    public void setLast(boolean last) { this.last = last; }
}

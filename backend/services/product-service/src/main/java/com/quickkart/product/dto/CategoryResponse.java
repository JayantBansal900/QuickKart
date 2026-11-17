package com.quickkart.product.dto;

import com.quickkart.product.entity.Category;

/** {@code key} is the upper-case name the catalog filter uses (?category=HOME%20%26%20LIVING). */
public record CategoryResponse(Long id, String key, String name, String description, String imageUrl,
                               int sortOrder, boolean active, long productCount) {

    public static CategoryResponse from(Category c, long productCount) {
        return new CategoryResponse(c.getId(), c.getName().toUpperCase(java.util.Locale.ROOT), c.getName(),
                c.getDescription(), c.getImageUrl(), c.getSortOrder(), c.isActive(), productCount);
    }
}

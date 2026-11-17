package com.quickkart.product.dto;

import java.io.Serializable;

/** Number of products per category, used for the storefront department chips. */
public class CategoryCount implements Serializable {

    private static final long serialVersionUID = 1L;

    private String category;
    private long count;

    public CategoryCount() {
    }

    public CategoryCount(String category, long count) {
        this.category = category;
        this.count = count;
    }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public long getCount() { return count; }
    public void setCount(long count) { this.count = count; }
}

package com.quickkart.product.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CategoryRequest(
        @NotBlank @Size(max = 80) @Pattern(regexp = "[\\p{L}\\p{N} &'-]+", message = "Use letters, numbers, spaces, & ' or -") String name,
        @Size(max = 300) String description,
        @Size(max = 1000) @Pattern(regexp = "^(/[^\\s]*|https://[^\\s]+)?$", message = "Image must be a site path or an https URL") String imageUrl,
        @Min(0) @Max(100000) Integer sortOrder,
        Boolean active
) {
}

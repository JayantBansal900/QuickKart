package com.quickkart.product.config;

import com.quickkart.product.entity.Category;
import com.quickkart.product.repository.CategoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Creates the three QuickKart categories when the table is empty (migration V6 inserts the same
 * rows in Docker). Runs before the catalog seeder, whose products need these categories.
 * Never touches existing rows, so admin edits are kept.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CategoryInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(CategoryInitializer.class);

    static final List<Category> DEFAULTS = List.of(
            new Category("Clothing", "Tees, shirts, hoodies, jackets, jeans and more", "/categories/clothing.webp", 10),
            new Category("Shoes", "Sneakers, boots, loafers and slides", "/categories/shoes.webp", 20),
            new Category("Accessories", "Caps, bags, wallets, belts, watches and sunglasses", "/categories/accessories.webp", 30));

    private final CategoryRepository categories;

    public CategoryInitializer(CategoryRepository categories) {
        this.categories = categories;
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (categories.count() > 0) return;
        for (Category d : DEFAULTS) {
            categories.save(new Category(d.getName(), d.getDescription(), d.getImageUrl(), d.getSortOrder()));
        }
        log.info("Created {} default categories", DEFAULTS.size());
    }
}

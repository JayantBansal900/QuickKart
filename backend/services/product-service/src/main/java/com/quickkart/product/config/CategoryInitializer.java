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
 * Creates the eight VAYU categories when the table is empty (migration V6 inserts the same
 * rows in Docker). Runs before the catalog seeder, whose products need these categories.
 * Never touches existing rows, so admin edits are kept.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CategoryInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(CategoryInitializer.class);

    static final List<Category> DEFAULTS = List.of(
            new Category("T-Shirts", "Crew, polo, henley and oversized tees", "/categories/t-shirts.webp", 10),
            new Category("Shirts", "Oxford, linen, flannel and formal shirts", "/categories/shirts.webp", 20),
            new Category("Jeans", "Slim, straight, relaxed and tapered denim", "/categories/jeans.webp", 30),
            new Category("Trousers", "Chinos, cargos, joggers and formal trousers", "/categories/trousers.webp", 40),
            new Category("Jackets", "Bombers, denim, puffers and blazers", "/categories/jackets.webp", 50),
            new Category("Hoodies & Sweatshirts", "Hoodies, sweatshirts and knitwear", "/categories/hoodies.webp", 60),
            new Category("Footwear", "Sneakers, loafers, boots and slides", "/categories/footwear.webp", 70),
            new Category("Accessories", "Belts, wallets, caps, watches and more", "/categories/vayu-accessories.webp", 80));

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

package com.quickkart.product.repository;

import com.quickkart.product.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CategoryRepository extends JpaRepository<Category, Long> {

    @Query("select c from Category c where upper(c.name) = upper(:name)")
    Optional<Category> findByNameIgnoreCase(@Param("name") String name);

    List<Category> findAllByOrderBySortOrderAscNameAsc();

    List<Category> findByActiveTrueOrderBySortOrderAscNameAsc();
}

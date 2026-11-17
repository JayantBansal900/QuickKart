package com.quickkart.service;

import com.quickkart.dto.ProductRequest;
import com.quickkart.dto.ProductResponse;
import com.quickkart.entity.Product;
import com.quickkart.exception.ResourceNotFoundException;
import com.quickkart.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProductServiceTest {

    @Mock
    private ProductRepository productRepository;

    @InjectMocks
    private ProductService productService;

    private Product sampleProduct;

    @BeforeEach
    void setUp() {
        sampleProduct = new Product(
                1L,
                "iPhone 16",
                "Apple smartphone",
                new BigDecimal("79999.00"),
                20,
                "Electronics"
        );
    }

    @Test
    void shouldCreateProduct() {
        ProductRequest request = new ProductRequest(
                "iPhone 16",
                "Apple smartphone",
                new BigDecimal("79999.00"),
                20,
                "Electronics"
        );

        when(productRepository.save(any(Product.class))).thenReturn(sampleProduct);

        ProductResponse response = productService.createProduct(request);

        assertNotNull(response);
        assertEquals(1L, response.getId());
        assertEquals("iPhone 16", response.getName());
        assertEquals(new BigDecimal("79999.00"), response.getPrice());
        assertEquals(20, response.getStockQuantity());
        verify(productRepository).save(any(Product.class));
    }

    @Test
    void shouldGetAllProducts() {
        when(productRepository.findAll()).thenReturn(List.of(sampleProduct));

        List<ProductResponse> responses = productService.getAllProducts();

        assertNotNull(responses);
        assertEquals(1, responses.size());
        assertEquals("iPhone 16", responses.get(0).getName());
        verify(productRepository).findAll();
    }

    @Test
    void shouldGetProductByIdWhenExists() {
        when(productRepository.findById(1L)).thenReturn(Optional.of(sampleProduct));

        ProductResponse response = productService.getProductById(1L);

        assertNotNull(response);
        assertEquals(1L, response.getId());
        assertEquals("iPhone 16", response.getName());
        verify(productRepository).findById(1L);
    }

    @Test
    void shouldThrowExceptionWhenProductNotFound() {
        when(productRepository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> productService.getProductById(999L));
        verify(productRepository).findById(999L);
    }
}

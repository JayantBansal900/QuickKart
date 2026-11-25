package com.quickkart.product.config;
import com.quickkart.product.entity.Product;
import com.quickkart.product.repository.ProductRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.Optional;
import static org.mockito.Mockito.*;
class ProductSeedSafetyTest {
    @Test void disabledInitializerNeverTouchesRepository() {
        var repository=mock(ProductRepository.class);
        var initializer=new DevProductInitializer(repository,org.mockito.Mockito.mock(com.quickkart.product.repository.ProductVariantRepository.class),new ObjectMapper(),new org.springframework.beans.factory.support.StaticListableBeanFactory().getBeanProvider(org.springframework.cache.CacheManager.class));
        ReflectionTestUtils.setField(initializer,"devProductsEnabled",false);
        initializer.run();verifyNoInteractions(repository);
    }
    @Test void explicitlyEnabledInitializerNeverOverwritesExistingProducts() {
        var repository=mock(ProductRepository.class);
        when(repository.findBySku(anyString())).thenReturn(Optional.of(new Product()));
        var initializer=new DevProductInitializer(repository,org.mockito.Mockito.mock(com.quickkart.product.repository.ProductVariantRepository.class),new ObjectMapper(),new org.springframework.beans.factory.support.StaticListableBeanFactory().getBeanProvider(org.springframework.cache.CacheManager.class));
        ReflectionTestUtils.setField(initializer,"devProductsEnabled",true);
        initializer.run();verify(repository,never()).save(any(Product.class));
    }
}

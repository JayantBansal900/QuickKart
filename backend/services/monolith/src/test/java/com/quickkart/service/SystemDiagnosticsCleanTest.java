package com.quickkart.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SystemDiagnosticsCleanTest {

    @Test
    void errorTextsNeverShowInternalHostsAndStayShort() {
        assertThat(SystemDiagnosticsService.clean("TimeoutException: Topic not present after 60000 ms on kafka:29092"))
                .doesNotContain("kafka:29092").contains("<host>");
        assertThat(SystemDiagnosticsService.clean("x".repeat(400))).hasSize(161);
    }
}

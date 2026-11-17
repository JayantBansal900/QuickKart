package com.quickkart.gateway.filter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.UUID;

@Component
public class CorrelationIdFilter implements GlobalFilter, Ordered {

    private static final Logger logger = LoggerFactory.getLogger(CorrelationIdFilter.class);
    public static final String CORRELATION_ID_HEADER = "X-Correlation-ID";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        HttpHeaders headers = request.getHeaders();
        List<String> correlationIdList = headers.get(CORRELATION_ID_HEADER);

        String correlationId;
        if (correlationIdList != null && !correlationIdList.isEmpty() && correlationIdList.get(0) != null && !correlationIdList.get(0).isBlank()) {
            correlationId = correlationIdList.get(0);
        } else {
            correlationId = UUID.randomUUID().toString();
        }

        MDC.put("correlationId", correlationId);

        ServerHttpRequest modifiedRequest = request.mutate()
                .header(CORRELATION_ID_HEADER, correlationId)
                .build();

        ServerWebExchange modifiedExchange = exchange.mutate()
                .request(modifiedRequest)
                .build();

        modifiedExchange.getResponse().getHeaders().add(CORRELATION_ID_HEADER, correlationId);

        logger.info("[API Gateway] Routing request: {} {} [CorrelationId: {}]",
                request.getMethod(), request.getURI().getPath(), correlationId);

        return chain.filter(modifiedExchange).doFinally(signalType -> MDC.remove("correlationId"));
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}

package com.quickkart.service;
import com.quickkart.entity.CartItem;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
public final class CartQuote {
    private CartQuote() {}
    public static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    public static String fingerprint(List<CartItem> items) {
        StringBuilder value=new StringBuilder("v1");
        items.stream().sorted(Comparator.comparing(i->i.getProduct().getId())).forEach(i -> {
            var p=i.getProduct();
            value.append('|').append(p.getId()).append(':').append(i.getQuantity()).append(':')
                .append(p.getPrice().stripTrailingZeros().toPlainString()).append(':').append(hash(p.getName()));
        });
        return hash(value.toString());
    }
}

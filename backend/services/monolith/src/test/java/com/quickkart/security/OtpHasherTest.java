package com.quickkart.security;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class OtpHasherTest {
    @Test void hashesAreSaltedKeyedAndBoundToAccount() {
        var a=new OtpHasher("b3RwLXRlc3Qtb25seS1zZXBhcmF0ZS1rZXktMzItYnl0ZXMtMTIzNA==");
        var b=new OtpHasher("dGVzdC1vbmx5LWtleS0zMi1ieXRlcy1taW5pbXVtLTEyMzQ1Njc4OTA=");
        String hash=a.hash("a@example.com","123456");
        assertNotEquals(hash,a.hash("a@example.com","123456"));
        assertTrue(a.matches("a@example.com","123456",hash));
        assertFalse(a.matches("b@example.com","123456",hash));
        assertFalse(b.matches("a@example.com","123456",hash));
        assertFalse(a.matches("a@example.com","000000",hash));
        assertFalse(a.matches("a@example.com","123456","legacy-hash"));
    }
    @Test void shortKeysAreRejected() {assertThrows(IllegalArgumentException.class,()->new OtpHasher("c2hvcnQ="));}
}

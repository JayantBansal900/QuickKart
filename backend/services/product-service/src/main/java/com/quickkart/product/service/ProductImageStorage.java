package com.quickkart.product.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Stores product photos uploaded by admins on local disk (a Docker volume in the Compose stack).
 *
 * <p>Safety rules:
 * <ul>
 *   <li>The type is decided from the file's first bytes (JPEG/PNG/WebP signatures), never from the
 *       client's file name or Content-Type, so an HTML or SVG file renamed to .jpg is rejected.</li>
 *   <li>Files get a random UUID name; user input never becomes part of a path.</li>
 *   <li>Reads only accept names matching {@link #NAME}, so "../" tricks cannot escape the folder.</li>
 * </ul>
 */
@Service
public class ProductImageStorage {

    public static final String URL_PREFIX = "/api/products/images/";
    public static final long MAX_BYTES = 3L * 1024 * 1024;
    private static final Pattern NAME = Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp)$");
    private static final Logger log = LoggerFactory.getLogger(ProductImageStorage.class);

    public record StoredImage(Path path, String contentType) {}

    private final Path root;

    public ProductImageStorage(@Value("${app.uploads.dir:./uploads}") String dir) {
        this.root = Path.of(dir, "products").toAbsolutePath().normalize();
    }

    /** Validates and saves the bytes; returns the public URL of the new image. */
    public String save(byte[] bytes) {
        if (bytes == null || bytes.length == 0) throw new IllegalArgumentException("Choose an image file to upload.");
        if (bytes.length > MAX_BYTES) throw new IllegalArgumentException("Image is too large. The limit is 3 MB.");
        String ext = detectExtension(bytes)
                .orElseThrow(() -> new IllegalArgumentException("Only JPEG, PNG or WebP images are allowed."));
        String name = UUID.randomUUID() + "." + ext;
        try {
            Files.createDirectories(root);
            Path tmp = Files.createTempFile(root, "upload-", ".part");
            Files.write(tmp, bytes);
            Files.move(tmp, root.resolve(name), StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not store product image", e);
        }
        return URL_PREFIX + name;
    }

    public Optional<StoredImage> find(String name) {
        if (name == null || !NAME.matcher(name).matches()) return Optional.empty();
        Path path = root.resolve(name).normalize();
        if (!path.startsWith(root) || !Files.isRegularFile(path)) return Optional.empty();
        String type = name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : "image/jpeg";
        return Optional.of(new StoredImage(path, type));
    }

    /** Removes a previously uploaded image when it is replaced. Catalog artwork (/products/...) is never touched. */
    public void deleteIfUploaded(String url) {
        if (url == null || !url.startsWith(URL_PREFIX)) return;
        find(url.substring(URL_PREFIX.length())).ifPresent(img -> {
            try {
                Files.deleteIfExists(img.path());
            } catch (IOException e) {
                log.warn("Could not delete replaced product image {}", img.path().getFileName());
            }
        });
    }

    static Optional<String> detectExtension(byte[] b) {
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) return Optional.of("jpg");
        if (b.length >= 8 && Arrays.equals(Arrays.copyOf(b, 8), new byte[]{(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A})) return Optional.of("png");
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return Optional.of("webp");
        return Optional.empty();
    }
}

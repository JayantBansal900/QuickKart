package com.quickkart;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import com.quickkart.entity.*;
import com.quickkart.repository.*;
import java.math.BigDecimal;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.DEFINED_PORT,properties={"server.port=18081","server.address=127.0.0.1"})
class CommerceBrowserFixture {
 @Autowired UserRepository users; @Autowired ProductRepository products;
 @Autowired org.springframework.security.crypto.password.PasswordEncoder encoder;
 @Test void serveDisposableBrowserFixture()throws Exception {
  var user=new User("Browser Customer","browser@example.invalid",encoder.encode("Browser-Test-42!"),"USER");user.setEmailVerified(true);user.setAccountStatus("ACTIVE");users.saveAndFlush(user);
  products.saveAndFlush(new Product("Disposable Commerce Product","Browser verification only",new BigDecimal("125.00"),10,"Electronics"));
  System.out.println("PHASE4_BROWSER_FIXTURE_READY");
  // Explicit invocation only; the in-memory database disappears on process exit.
  java.nio.file.Path stop=java.nio.file.Path.of("target/phase4-browser.stop");java.nio.file.Files.deleteIfExists(stop);
  long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.MINUTES.toNanos(20);
  while(System.nanoTime()<deadline && !java.nio.file.Files.exists(stop))Thread.sleep(500);
 }
}

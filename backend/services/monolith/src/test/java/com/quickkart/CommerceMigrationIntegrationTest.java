package com.quickkart;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import javax.sql.DataSource;
import java.nio.file.*;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest
class CommerceMigrationIntegrationTest {
 @Autowired DataSource dataSource;
 @Test void additiveMigrationPreservesLegacyRowsAndCanBeReapplied() throws Exception {
  String schema="migration_"+UUID.randomUUID().toString().replace("-","");
  try(var connection=dataSource.getConnection();var sql=connection.createStatement()) {
   String original=connection.getSchema();
   sql.execute("CREATE SCHEMA \""+schema+"\"");connection.setSchema(schema);
   try {
    sql.execute("CREATE TABLE orders (id BIGINT PRIMARY KEY,user_id BIGINT,total_amount DECIMAL(12,2),status VARCHAR(50))");
    sql.execute("CREATE TABLE order_items (id BIGINT PRIMARY KEY,order_id BIGINT,product_id BIGINT,quantity INTEGER,price DECIMAL(12,2))");
    sql.execute("INSERT INTO orders VALUES (1,7,12.50,'CONFIRMED')");sql.execute("INSERT INTO order_items VALUES (1,1,42,1,12.50)");
    String migration=Files.readString(Path.of("../../../infrastructure/postgres/migrations/V2__commerce_reliability.sql")).replaceAll("(?m)--.*$","");
    for(int pass=0;pass<2;pass++)for(String statement:migration.split(";"))if(!statement.isBlank())sql.execute(statement);
    try(var row=sql.executeQuery("SELECT total_amount,checkout_key FROM orders WHERE id=1")){assertTrue(row.next());assertEquals("12.50",row.getBigDecimal(1).toPlainString());assertNull(row.getString(2));}
    try(var row=sql.executeQuery("SELECT product_id,product_name FROM order_items WHERE id=1")){assertTrue(row.next());assertEquals(42,row.getLong(1));assertNull(row.getString(2));}
    sql.execute("INSERT INTO orders(id,user_id,checkout_key) VALUES(2,7,'key')");
    assertThrows(java.sql.SQLException.class,()->sql.execute("INSERT INTO orders(id,user_id,checkout_key) VALUES(3,7,'key')"));
    sql.execute("INSERT INTO orders(id,user_id,checkout_key) VALUES(4,8,'key')");
   }finally{connection.setSchema(original);sql.execute("DROP SCHEMA \""+schema+"\" CASCADE");}
  }
 }
}

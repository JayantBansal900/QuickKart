import tempfile, unittest, zipfile
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
import audit_images, verify_runtime
class RuntimeSafetyTests(unittest.TestCase):
    def test_scan_budget_scales_with_image(self):
        self.assertEqual(audit_images.budget(3*audit_images.GIB), 20*audit_images.GIB)
    def test_scan_low_capacity_blocks(self):
        with patch('audit_images.shutil.disk_usage', return_value=SimpleNamespace(free=1)):
            with self.assertRaisesRegex(RuntimeError, 'BLOCKED'): audit_images.check_space(Path.cwd(), 2)
    def test_runtime_rejects_test_broker(self):
        with tempfile.TemporaryDirectory() as d:
            jar=Path(d)/'test.jar'
            with zipfile.ZipFile(jar, 'w') as z: z.writestr('BOOT-INF/lib/spring-kafka-test-3.3.jar', '')
            with self.assertRaisesRegex(RuntimeError, 'Test/broker'): verify_runtime.inspect(jar)
    def test_runtime_accepts_kafka_client(self):
        with tempfile.TemporaryDirectory() as d:
            jar=Path(d)/'test.jar'
            with zipfile.ZipFile(jar, 'w') as z: z.writestr('BOOT-INF/lib/kafka-clients-3.9.jar', '')
            self.assertEqual(len(verify_runtime.inspect(jar)['libraries']), 1)
    def test_runtime_rejects_stale_security_patch(self):
        with tempfile.TemporaryDirectory() as d:
            jar=Path(d)/'test.jar'
            with zipfile.ZipFile(jar, 'w') as z: z.writestr('BOOT-INF/lib/tomcat-embed-core-10.1.55.jar', '')
            with self.assertRaisesRegex(RuntimeError, 'Stale security'): verify_runtime.inspect(jar)
if __name__ == '__main__': unittest.main()


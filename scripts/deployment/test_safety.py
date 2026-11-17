import json,unittest
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
import safety,verify_staging
class DeploymentSafetyTest(unittest.TestCase):
    def test_low_disk_fails_before_heavy_work(self):
        with patch('safety.shutil.disk_usage',return_value=SimpleNamespace(free=1024)):
            with self.assertRaisesRegex(RuntimeError,'Insufficient free disk'): safety.require_capacity(Path.cwd())
    def test_existing_project_is_never_accepted_as_staging(self):
        metadata=[{'Config':{'Labels':{'com.docker.compose.project':'quickkart-backend','com.docker.compose.service':'postgres'}}}]
        with patch('verify_staging.run',side_effect=[b'existing-id',json.dumps(metadata).encode()]):
            with self.assertRaisesRegex(RuntimeError,'non-staging'): verify_staging.container('postgres')
    def test_wrong_service_is_rejected(self):
        metadata=[{'Config':{'Labels':{'com.docker.compose.project':'quickkart-stage-p5','com.docker.compose.service':'backend'}}}]
        with patch('verify_staging.run',side_effect=[b'stage-id',json.dumps(metadata).encode()]):
            with self.assertRaisesRegex(RuntimeError,'Unexpected staging service'): verify_staging.container('postgres')
    def test_database_marker_required_before_mutation(self):
        with patch('verify_staging.container',return_value='owned-stage-id'),patch('verify_staging.subprocess.run',return_value=SimpleNamespace(stdout=b'wrong-db')) as execute:
            with self.assertRaisesRegex(RuntimeError,'without staging marker'): verify_staging.sql('UPDATE products SET price=0')
            self.assertEqual(execute.call_count,1)
            self.assertEqual(execute.call_args.kwargs['input'],b'SELECT identity FROM quickkart_stage_guard;')
if __name__=='__main__':unittest.main()

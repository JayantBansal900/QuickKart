"""Fail if test/broker libraries leak into freshly packaged application JARs."""
import json, zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
FORBIDDEN = ('spring-kafka-test-', 'kafka_2.13-', 'kafka-server-', 'zookeeper-', 'junit-', 'mockito-', 'h2-', 'testcontainers-')
def inspect(jar):
    with zipfile.ZipFile(jar) as archive:
        libs = sorted(n.rsplit('/', 1)[-1] for n in archive.namelist() if n.startswith('BOOT-INF/lib/') and n.endswith('.jar'))
    if not libs: raise RuntimeError(f'No runtime libraries: {jar.name}')
    leaked = [n for n in libs if n.startswith(FORBIDDEN) or n.endswith('-test.jar')]
    if leaked: raise RuntimeError(f'Test/broker dependencies in {jar.name}: {leaked}')
    required = {'tomcat-embed-core-': '10.1.61', 'netty-handler-': '4.1.139.Final', 'postgresql-': '42.7.14', 'spring-boot-': '3.5.16'}
    for prefix, version in required.items():
        candidates = [n for n in libs if n.startswith(prefix) and n[len(prefix):len(prefix)+1].isdigit()]
        if any(n != prefix+version+'.jar' for n in candidates):
            raise RuntimeError(f'Stale security dependency in {jar.name}: {candidates}')
    return {'jar': jar.name, 'bytes': jar.stat().st_size, 'libraries': libs}
def main():
    result = {}
    for service in ['monolith', 'product-service', 'order-service', 'api-gateway']:
        jars = list((ROOT/'backend/services'/service/'target').glob('*.jar'))
        if len(jars) != 1: raise RuntimeError(f'Expected one freshly built JAR for {service}')
        result[service] = inspect(jars[0])
    output = ROOT/'docs/engineering/phase-6-runtime-libraries.json'
    output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print('PASS: four JARs contain no forbidden test/broker libraries')
if __name__ == '__main__': main()

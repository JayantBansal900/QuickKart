"""Bounded sequential scans. Never deletes caches, images or volumes."""
import hashlib, json, os, shutil, subprocess
from pathlib import Path
from staging import ROOT, LOCAL
GIB = 1024**3
def budget(image_bytes):
    return max(10*GIB, image_bytes*6 + 2*GIB)
def check_space(path, required):
    if shutil.disk_usage(path).free < required:
        raise RuntimeError(f'BLOCKED: insufficient capacity on {Path(path).anchor}; need {required} bytes')
def main():
    # Scout may use host caches despite TMP overrides: reserve C: independently.
    temp = LOCAL/'scout-temp'; temp.mkdir(parents=True, exist_ok=True)
    cache = LOCAL/'scout-cache'; cache.mkdir(exist_ok=True)
    env = os.environ.copy(); env.update(TEMP=str(temp), TMP=str(temp), TMPDIR=str(temp), DOCKER_SCOUT_CACHE_DIR=str(cache))
    output = LOCAL/'phase6'; output.mkdir(exist_ok=True)
    for service in ['backend', 'order-service', 'product-service', 'api-gateway', 'frontend']:
        check_space(Path.home(), 8*GIB)
        tag = 'quickkart-stage-p5/'+service+':phase5'
        raw = subprocess.run(['docker','image','inspect',tag,'--format','{{json .}}'], capture_output=True, check=True, timeout=10)
        info = json.loads(raw.stdout); required = budget(info['Size'])
        check_space(temp, required)
        identity = info['Id'].split(':')[-1]
        report = output/(service+'-'+identity+'.sarif.json')
        stamp = report.with_suffix('.sha256')
        if report.exists() and stamp.exists() and hashlib.sha256(report.read_bytes()).hexdigest() == stamp.read_text():
            print(service+': reusing same-image report; advisory freshness still requires release review'); continue
        # No explicit docker save/export archive; Scout consumes the existing local image.
        with (output/(service+'-scan.log')).open('w') as log:
            subprocess.run(['docker','scout','cves','--format','sarif','--output',str(report),'local://'+identity], env=env, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=900)
        json.loads(report.read_text(encoding='utf-8'))
        stamp.write_text(hashlib.sha256(report.read_bytes()).hexdigest())
        check_space(temp, 2*GIB)
        print(service+': completed; retain evidence and review residual temporary files')
if __name__ == '__main__': main()

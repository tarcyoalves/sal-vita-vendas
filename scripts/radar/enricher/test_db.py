import urllib.parse
with open('/home/ubuntu/.env-radar') as f:
    url = f.read().strip().split('=', 1)[1]
print("Query params:")
parsed = urllib.parse.urlparse(url)
print(parsed.query)

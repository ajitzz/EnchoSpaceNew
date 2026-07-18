import os
import psycopg2

db_url = os.environ.get('DATABASE_URL')
if not db_url:
    with open('.env', 'r') as f:
        for line in f:
            if line.startswith('DATABASE_URL='):
                db_url = line.strip().split('=', 1)[1]
                break

print("Connecting to DB...")
conn = psycopg2.connect(db_url)
cur = conn.cursor()
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'host_social_posts';")
print("host_social_posts columns:", cur.fetchall())

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'marketing_campaigns';")
print("marketing_campaigns columns:", cur.fetchall())

conn.close()

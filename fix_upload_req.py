import re

with open('server.ts', 'r') as f:
    content = f.read()

# Fix the AuthRequest to include `file` from multer if needed
# Multer adds `file` to `req` which is Express.Request, and AuthRequest extends it.

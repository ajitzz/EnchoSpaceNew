#!/bin/bash
npm run start > server_run3.log 2>&1 &
sleep 5
cat server_run3.log
curl -s http://localhost:3000/api/health

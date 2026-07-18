#!/bin/bash
pkill node
sleep 2
npm run start > server_run5.log 2>&1 &
sleep 5
cat server_run5.log
curl -s http://localhost:3000/api/health

kill $(ps aux | grep 'npm run build' | awk '{print $2}')

#!/bin/bash
export DATABASE_URL=$(cut -d= -f2- /home/ubuntu/.env-radar)
# Timeout so it naturally terminates after processing the first one or running for 60s
timeout 60 .venv/bin/python3 worker.py || true

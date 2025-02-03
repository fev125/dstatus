#!/bin/bash
docker login
docker build -t dstatus .
docker tag dstatus:latest fev125/dstatus
docker push fev125/dstatus
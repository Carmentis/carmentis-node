FROM golang

RUN go install github.com/cometbft/cometbft/cmd/cometbft@latest
RUN apt update && apt install -y python3 python3-pip python3-venv && python3 --version


WORKDIR /app
RUN python3 -m venv venv
RUN venv/bin/pip install requests
RUN cometbft init --home /app/data
COPY start.py .
CMD venv/bin/python start.py --comet_home /app/data
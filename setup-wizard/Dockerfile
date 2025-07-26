FROM golang

RUN go install github.com/cometbft/cometbft/cmd/cometbft@latest
RUN apt update && apt install -y python3 python3-pip python3-venv && python3 --version


WORKDIR /app
RUN python3 -m venv venv
RUN venv/bin/pip install requests
COPY setup.py .
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
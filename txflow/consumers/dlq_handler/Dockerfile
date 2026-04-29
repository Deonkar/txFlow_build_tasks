FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY dlq_handler/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY shared /app/shared
COPY dlq_handler /app/dlq_handler

EXPOSE 8001

CMD ["python", "-m", "dlq_handler.app"]


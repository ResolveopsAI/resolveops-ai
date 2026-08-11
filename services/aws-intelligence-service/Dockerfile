FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN groupadd -g 10001 appuser && useradd -u 10001 -g appuser -m -s /bin/bash appuser
RUN mkdir -p /app/data && chown -R appuser:appuser /app/data
COPY --chown=appuser:appuser . .
USER 10001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

# Trigger initial CI/CD build

# Retry initial CI/CD build after template fix

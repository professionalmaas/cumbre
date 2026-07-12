import json
import subprocess

AWS = r"C:\Program Files\Amazon\AWSCLIV2\aws.exe"
REGION = "us-east-1"


def sh(*args: str) -> str:
    return subprocess.check_output([AWS, *args, "--region", REGION], text=True)


raw = sh(
    "secretsmanager",
    "get-secret-value",
    "--secret-id",
    "hub-cumbre-prd/secrets",
    "--output",
    "json",
)
data = json.loads(json.loads(raw)["SecretString"])

client_id = sh(
    "cognito-idp",
    "list-user-pool-clients",
    "--user-pool-id",
    "us-east-1_ZOHBd9Q74",
    "--query",
    "UserPoolClients[?ClientName=='hub-cumbre-prd-magic-link'].ClientId",
    "--output",
    "text",
).strip()

client = json.loads(
    sh(
        "cognito-idp",
        "describe-user-pool-client",
        "--user-pool-id",
        "us-east-1_ZOHBd9Q74",
        "--client-id",
        client_id,
        "--output",
        "json",
    )
)["UserPoolClient"]

data["MAGIC_LINK_CLIENT_SECRET"] = client["ClientSecret"]
new_json = json.dumps(data)

sh(
    "secretsmanager",
    "put-secret-value",
    "--secret-id",
    "hub-cumbre-prd/secrets",
    "--secret-string",
    new_json,
)

print("MAGIC_LINK_CLIENT_SECRET added")
print("keys:", sorted(data.keys()))

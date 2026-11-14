import os
import ssl
from ftplib import FTP_TLS
from pathlib import Path


required_variables = (
    "CPANEL_FTP_HOST",
    "CPANEL_FTP_USERNAME",
    "CPANEL_FTP_PASSWORD",
)
missing_variables = [name for name in required_variables if not os.environ.get(name)]
if missing_variables:
    raise ValueError(f"Missing GitHub Actions secrets: {', '.join(missing_variables)}")

project_root = Path(__file__).resolve().parents[2]
website_files = ("index.html", "app.js", "styles.css", "supabase-config.js")
for filename in website_files:
    if not (project_root / filename).is_file():
        raise FileNotFoundError(f"Website file not found: {filename}")

with FTP_TLS(context=ssl.create_default_context(), timeout=30) as ftp:
    ftp.connect(os.environ["CPANEL_FTP_HOST"], 21)
    ftp.login(
        os.environ["CPANEL_FTP_USERNAME"],
        os.environ["CPANEL_FTP_PASSWORD"],
    )
    ftp.prot_p()

    for filename in website_files:
        with (project_root / filename).open("rb") as website_file:
            ftp.storbinary(f"STOR {filename}", website_file)
        print(f"Uploaded {filename}")

    ftp.quit()

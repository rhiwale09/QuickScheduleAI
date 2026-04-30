# quickschedule-start.ps1
# -----------------------------
# Full QuickScheduleAI dev startup script

# 1️⃣ Start Docker Desktop if needed
Write-Host "`n[1/6] Starting Docker Desktop..."
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
Start-Sleep -Seconds 15 # wait a bit for Docker daemon to be ready

# 2️⃣ Check if Postgres container exists and is running
$containerName = "chess-postgres-dev"
$container = docker ps -a --format "{{.Names}}" | Select-String $containerName

if (-not $container) {
    Write-Host "`n[2/6] Postgres container not found, creating..."
    docker run -d --name $containerName `
        -e POSTGRES_USER=quickscheduleai `
        -e POSTGRES_PASSWORD=qs123 `
        -e POSTGRES_DB=QuickScheduleAI `
        -p 5432:5432 `
        -v docker_postgres_dev_data:/var/lib/postgresql/data `
        postgres:15-alpine
} else {
    Write-Host "`n[2/6] Starting existing Postgres container..."
    docker start $containerName
}

# 3️⃣ Wait for Postgres to be healthy
Write-Host "`n[3/6] Waiting for Postgres to be ready..."
$ready = $false
for ($i=0; $i -lt 30; $i++) {
    $status = docker inspect -f "{{.State.Health.Status}}" $containerName
    if ($status -eq "healthy") {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
}
if (-not $ready) { Write-Host "Postgres did not become healthy in time"; exit 1 }

# 4️⃣ Start backend
Write-Host "`n[4/6] Starting backend..."
Push-Location .\backend
Start-Process "powershell" -ArgumentList "-NoExit", "-Command", "npx nodemon server.js"
Pop-Location
Start-Sleep -Seconds 5 # small buffer

# 5️⃣ Start frontend
Write-Host "`n[5/6] Starting frontend..."
Push-Location .\frontend
Start-Process "powershell" -ArgumentList "-NoExit", "-Command", "npm start"
Pop-Location

Write-Host "`n[6/6] QuickScheduleAI should now be running!"
Write-Host "Backend: http://localhost:5000"
Write-Host "Frontend: http://localhost:3000"
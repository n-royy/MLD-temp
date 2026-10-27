$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User')
"dotnet: $(dotnet --version)"
"java:   $((java -version 2>&1)[0])"
"mvn:    $((mvn -v 2>&1)[0])"
"node:   $(node --version)"
"pnpm:   $(pnpm --version)"
"python: $(python --version)"
"git:    $(git --version)"
"psql:   $(& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' --version)"

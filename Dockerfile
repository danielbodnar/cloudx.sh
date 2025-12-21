# cloudx.sh Development Environment Container
# Supports multiple runtimes: Node.js, Python, Go, Rust, Ruby, PHP

FROM debian:bookworm-slim

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install base utilities
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    unzip \
    zip \
    ca-certificates \
    gnupg \
    build-essential \
    procps \
    htop \
    vim \
    nano \
    jq \
    sudo \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 LTS
# SECURITY NOTE: This downloads and executes a remote installer script.
# The NodeSource installer source: https://github.com/nodesource/distributions
# For production use, consider:
# 1. Using Debian's official Node.js packages or downloading pre-built binaries with checksum verification
# 2. Hosting a vetted copy of the installer internally
# 3. Using a multi-stage build with verified artifacts
RUN curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource-setup.sh \
    && bash /tmp/nodesource-setup.sh \
    && rm /tmp/nodesource-setup.sh \
    && apt-get install -y nodejs \
    && npm install -g npm@latest \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
# SECURITY NOTE: This downloads and executes a remote installer script.
# The Bun installer source: https://github.com/oven-sh/bun/blob/main/src/install/install.sh
# For production use, consider:
# 1. Using package manager installation when available
# 2. Pinning to a specific Bun version with BUN_INSTALL_VERSION env var
# 3. Verifying checksums if downloading pre-built binaries directly
RUN curl -fsSL https://bun.sh/install -o /tmp/bun-install.sh \
    && bash /tmp/bun-install.sh \
    && rm /tmp/bun-install.sh
ENV PATH="/root/.bun/bin:${PATH}"

# Install Python 3.12 with pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Install Go
# Using Go 1.23.4 (latest stable as of December 2025)
# Update this version periodically or use a variable to make it easily configurable
ENV GO_VERSION=1.23.4
RUN wget -q https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz \
    && rm go${GO_VERSION}.linux-amd64.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"
ENV GOPATH="/root/go"
ENV PATH="${GOPATH}/bin:${PATH}"

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Ruby
RUN apt-get update && apt-get install -y \
    ruby \
    ruby-dev \
    && gem install bundler \
    && rm -rf /var/lib/apt/lists/*

# Install PHP
RUN apt-get update && apt-get install -y \
    php \
    php-cli \
    php-mbstring \
    php-xml \
    php-curl \
    php-zip \
    composer \
    && rm -rf /var/lib/apt/lists/*

# Install common development tools
RUN npm install -g \
    typescript \
    tsx \
    @cloudflare/wrangler \
    pnpm \
    yarn \
    vercel \
    serve \
    http-server \
    pm2

# Install Python development tools
RUN pip3 install --break-system-packages \
    poetry \
    pdm \
    uv \
    flask \
    fastapi \
    uvicorn \
    django

# Create workspace directory
WORKDIR /workspace

# Create a non-root user for safer execution
RUN useradd -m -s /bin/bash developer \
    && echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Set up Git configuration defaults
RUN git config --global init.defaultBranch main \
    && git config --global advice.detachedHead false

# Environment setup script
COPY <<EOF /usr/local/bin/setup-env.sh
#!/bin/bash
set -e

# Detect and set up project environment
if [ -f "package.json" ]; then
    echo "Node.js project detected"
    if [ -f "bun.lockb" ]; then
        bun install
    elif [ -f "pnpm-lock.yaml" ]; then
        pnpm install
    elif [ -f "yarn.lock" ]; then
        yarn install
    else
        npm install
    fi
elif [ -f "requirements.txt" ]; then
    echo "Python project detected"
    python -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
elif [ -f "pyproject.toml" ]; then
    echo "Python project with pyproject.toml detected"
    if grep -q "poetry" pyproject.toml 2>/dev/null; then
        poetry install
    elif grep -q "pdm" pyproject.toml 2>/dev/null; then
        pdm install
    else
        pip install -e .
    fi
elif [ -f "Cargo.toml" ]; then
    echo "Rust project detected"
    cargo build
elif [ -f "go.mod" ]; then
    echo "Go project detected"
    go mod download
elif [ -f "Gemfile" ]; then
    echo "Ruby project detected"
    bundle install
elif [ -f "composer.json" ]; then
    echo "PHP project detected"
    composer install
fi

echo "Environment setup complete!"
EOF

RUN chmod +x /usr/local/bin/setup-env.sh

# Default command
CMD ["/bin/bash"]

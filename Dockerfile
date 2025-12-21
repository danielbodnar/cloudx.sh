# cloudx.sh Development Environment Container
# Based on OpenCode template with multi-runtime support

FROM docker.io/cloudflare/sandbox:latest

# Add opencode install location to PATH before installation
ENV PATH="/root/.opencode/bin:${PATH}"

# Install OpenCode CLI
RUN curl -fsSL https://opencode.ai/install -o /tmp/install-opencode.sh \
    && bash /tmp/install-opencode.sh \
    && rm /tmp/install-opencode.sh \
    && opencode --version

# Install additional runtimes and tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Install Bun for faster Node.js operations
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Install common Node.js development tools
RUN npm install -g \
    typescript \
    tsx \
    pnpm \
    yarn

# Install Python development tools
RUN pip3 install --break-system-packages \
    poetry \
    uv \
    flask \
    fastapi \
    uvicorn

# Set up Git configuration defaults
RUN git config --global init.defaultBranch main \
    && git config --global advice.detachedHead false \
    && git config --global user.email "cloudx@cloudx.sh" \
    && git config --global user.name "CloudX"

# Create workspace directory
WORKDIR /home/user

# Expose OpenCode server port
EXPOSE 4096

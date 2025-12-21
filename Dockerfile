# cloudx.sh Development Environment Container
# Based on OpenCode template with multi-runtime support

FROM docker.io/cloudflare/sandbox:0.6.7

# Add opencode and mise install locations to PATH before installation
ENV PATH="/root/.opencode/bin:/root/.local/bin:${PATH}"

# Install mise (https://mise.jdx.dev/) for tool version management
RUN curl -L https://github.com/jdx/mise/releases/download/v2025.12.0/mise-v2025.12.0-linux-x64 > /root/.local/bin/mise
RUN chmod +x /root/.local/bin/mise
# Install OpenCode CLI
RUN curl -fsSL https://opencode.ai/install -o /tmp/install-opencode.sh \
    && bash /tmp/install-opencode.sh \
    && rm /tmp/install-opencode.sh \
    && opencode --version

# Clone sample project for the web UI to work with
RUN git clone --depth 1 https://github.com/cloudflare/agents.git /home/user/agents

# Start in the sample project directory
WORKDIR /home/user/agents

# Expose OpenCode server port
EXPOSE 4096

# Set up Git configuration defaults
RUN git config --global init.defaultBranch main \
    && git config --global advice.detachedHead false \
    && git config --global user.email "cloudx@cloudx.sh" \
    && git config --global user.name "CloudX" \
    && git config --global credential.helper '' \
    && git config --global core.askPass ''

# Disable git credential prompts (no TTY in container)
ENV GIT_TERMINAL_PROMPT=0

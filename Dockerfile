# cloudx.sh Development Environment Container
# Based on OpenCode template with multi-runtime support

FROM docker.io/cloudflare/sandbox:0.6.7

# Add opencode install location to PATH before installation
ENV PATH="/root/.opencode/bin:${PATH}"

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
    && git config --global user.name "CloudX"

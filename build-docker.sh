#!/usr/bin/env bash
set -euo pipefail

# 脚本所在目录
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

# 镜像名：默认使用当前目录名
PROJECT_NAME="${PROJECT_NAME:-$(basename "$SCRIPT_DIR")}"

# 获取最近的 Git tag，没有则置为 latest
get_git_tag() {
    if git -C "$SCRIPT_DIR" describe --tags --abbrev=0 >/dev/null 2>&1; then
        git -C "$SCRIPT_DIR" describe --tags --abbrev=0
    else
        echo "latest"
    fi
}

# tag：若用户传参则用用户的，否则用 git tag
TAG="${1:-$(get_git_tag)}"

# 透传给 docker build 的额外参数
EXTRA_ARGS=()
if [ "$#" -gt 1 ]; then
  shift
  EXTRA_ARGS=("$@")
fi

IMAGE_NAME="${PROJECT_NAME}:${TAG}"

echo "==> Building Docker image: ${IMAGE_NAME}"
echo "==> Dockerfile: ${SCRIPT_DIR}/Dockerfile"
echo "==> Build context: ${SCRIPT_DIR}"

if [ "${#EXTRA_ARGS[@]}" -ne 0 ]; then
  echo "==> Extra docker build args: ${EXTRA_ARGS[*]}"
fi

docker build \
  -f "${SCRIPT_DIR}/Dockerfile" \
  -t "${IMAGE_NAME}" \
  "${EXTRA_ARGS[@]}" \
  "${SCRIPT_DIR}"

echo
echo "✅ Build finished: ${IMAGE_NAME}"

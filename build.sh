#!/usr/bin/env bash
set -euo pipefail

# 脚本所在目录
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

# 镜像名：目录名
PROJECT_NAME="yearsyan/lynx-bundler"

# 获取最近 Git tag
get_git_tag() {
    if tag=$(git -C "$SCRIPT_DIR" describe --tags --abbrev=0 2>/dev/null); then
        echo "${tag#v}"
    else
        echo "latest"
    fi
}


TAG="${TAG:-$(get_git_tag)}"
IMAGE_NAME="${PROJECT_NAME}:${TAG}"

# ----------------------
#   参数解析
# ----------------------

if [ $# -lt 2 ]; then
  echo "用法："
  echo "  ./build.sh PROJECT_PATH REPO_URL"
  echo
  echo "示例："
  echo "  ./build.sh /workspace/app git@github.com:aaa/bbb.git"
  exit 1
fi

PROJECT_PATH="$1"
REPO_URL="$2"

# ----------------------
#   检查 config 目录
# ----------------------

HOST_CONFIG_DIR="${SCRIPT_DIR}/config"
if [ ! -d "${HOST_CONFIG_DIR}" ]; then
  echo "ERROR: 未找到 config 目录：${HOST_CONFIG_DIR}"
  exit 1
fi

# ----------------------
#   自动构建镜像（若不存在）
# ----------------------

if ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
  echo "==> 镜像 ${IMAGE_NAME} 不存在，拉取中"
  docker pull "${IMAGE_NAME}"
fi

# ----------------------
#   运行一次性构建容器
# ----------------------

echo "==> 使用镜像 ${IMAGE_NAME} 构建"
echo "==> PROJECT_PATH = ${PROJECT_PATH}"
echo "==> REPO_URL     = ${REPO_URL}"
echo "==> config 挂载: ${HOST_CONFIG_DIR} -> /config"
echo

docker run --rm \
  -e PROJECT_PATH="${PROJECT_PATH}" \
  -e REPO_URL="${REPO_URL}" \
  -v "${HOST_CONFIG_DIR}:/config" \
  "${IMAGE_NAME}"

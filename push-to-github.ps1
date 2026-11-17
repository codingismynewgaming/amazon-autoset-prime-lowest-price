# Prime Filter & Price Sort for Amazon - GitHub Push Script
# Pushes the current branch to the existing GitHub repository.

$repoUrl = "https://github.com/codingismynewgaming/amazon-autoset-prime-lowest-price.git"

if (-not (git remote | Select-String -SimpleMatch "origin")) {
    git remote add origin $repoUrl
}

$branch = git rev-parse --abbrev-ref HEAD
git push -u origin $branch

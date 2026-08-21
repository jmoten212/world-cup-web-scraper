locals {
  ecr_repository_name = coalesce(var.repository_name, "${var.project_name}-${var.environment}")
}

resource "aws_ecr_repository" "app" {
  name                 = local.ecr_repository_name
  image_tag_mutability = var.image_tag_mutability
  force_delete         = var.force_delete

  image_scanning_configuration {
    scan_on_push = var.scan_on_push
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire old untagged images"
        selection = {
          tagStatus   = "untagged"
          countType   = "imageCountMoreThan"
          countNumber = var.untagged_image_retention_count
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

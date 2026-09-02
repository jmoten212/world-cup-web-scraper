variable "aws_region" {
  description = "AWS region that will host the ECR repository."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Optional AWS CLI profile name to use for Terraform operations."
  type        = string
  default     = ""
}

variable "project_name" {
  description = "Project identifier used for tagging and default resource naming."
  type        = string
  default     = "world-cup-web-scraper"
}

variable "environment" {
  description = "Environment name used in resource names and tags."
  type        = string
  default     = "prod"
}

variable "repository_name" {
  description = "Override for the ECR repository name. Leave null to derive from project and environment."
  type        = string
  default     = null
}

variable "image_tag_mutability" {
  description = "Whether image tags can be overwritten."
  type        = string
  default     = "MUTABLE"

  validation {
    condition     = contains(["MUTABLE", "IMMUTABLE"], var.image_tag_mutability)
    error_message = "image_tag_mutability must be either MUTABLE or IMMUTABLE."
  }
}

variable "scan_on_push" {
  description = "Enable basic vulnerability scanning when images are pushed."
  type        = bool
  default     = true
}

variable "force_delete" {
  description = "Allow Terraform to delete the repository even when it still contains images."
  type        = bool
  default     = false
}

variable "untagged_image_retention_count" {
  description = "How many untagged images to keep before ECR expires the oldest ones."
  type        = number
  default     = 5

  validation {
    condition     = var.untagged_image_retention_count > 0
    error_message = "untagged_image_retention_count must be greater than 0."
  }
}

variable "vpc_id" {
  description = "Optional VPC ID for ECS and ALB. Leave empty to use the default VPC."
  type        = string
  default     = ""
}

variable "subnet_ids" {
  description = "Optional subnet IDs for ECS and ALB. Leave empty to use all subnets in the selected VPC."
  type        = list(string)
  default     = []
}

variable "app_port" {
  description = "Container port exposed by the application."
  type        = number
  default     = 3001
}

variable "container_image_tag" {
  description = "Image tag in ECR to deploy to ECS."
  type        = string
  default     = "latest"
}

variable "ecs_desired_count" {
  description = "Number of ECS tasks to keep running."
  type        = number
  default     = 1

  validation {
    condition     = var.ecs_desired_count > 0
    error_message = "ecs_desired_count must be greater than 0."
  }
}

variable "ecs_task_cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 512
}

variable "ecs_task_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 1024
}

variable "ecs_runtime_cpu_architecture" {
  description = "CPU architecture for ECS tasks."
  type        = string
  default     = "X86_64"

  validation {
    condition     = contains(["X86_64", "ARM64"], var.ecs_runtime_cpu_architecture)
    error_message = "ecs_runtime_cpu_architecture must be X86_64 or ARM64."
  }
}

variable "ecs_runtime_os_family" {
  description = "Operating system family for ECS tasks."
  type        = string
  default     = "LINUX"

  validation {
    condition     = contains(["LINUX", "WINDOWS_SERVER_2019_FULL", "WINDOWS_SERVER_2019_CORE", "WINDOWS_SERVER_2022_FULL", "WINDOWS_SERVER_2022_CORE"], var.ecs_runtime_os_family)
    error_message = "ecs_runtime_os_family must be a supported ECS OS family value."
  }
}

variable "ecs_log_retention_days" {
  description = "CloudWatch log retention for ECS container logs in days."
  type        = number
  default     = 14
}

variable "health_check_path" {
  description = "ALB target group health check path."
  type        = string
  default     = "/health"
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN used by the public ALB HTTPS listener."
  type        = string
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for the custom domain. Leave null to skip DNS wiring."
  type        = string
  default     = null
}

variable "route53_record_name" {
  description = "Fully qualified domain name to point at the ALB, such as app.example.com. Leave null to skip DNS wiring."
  type        = string
  default     = null
}

variable "assign_public_ip" {
  description = "Whether ECS tasks should get public IP addresses."
  type        = bool
  default     = true
}

variable "alb_ingress_cidr_blocks" {
  description = "CIDR blocks allowed to access the public ALB on HTTPS."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

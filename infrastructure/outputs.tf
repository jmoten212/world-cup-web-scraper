output "ecr_repository_name" {
  description = "Name of the ECR repository."
  value       = aws_ecr_repository.app.name
}

output "ecr_repository_arn" {
  description = "ARN of the ECR repository."
  value       = aws_ecr_repository.app.arn
}

output "ecr_repository_url" {
  description = "Repository URL to use with docker push."
  value       = aws_ecr_repository.app.repository_url
}

output "ecr_registry_id" {
  description = "AWS account registry ID that owns the ECR repository."
  value       = aws_ecr_repository.app.registry_id
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster."
  value       = aws_ecs_cluster.app.name
}

output "ecs_service_name" {
  description = "Name of the ECS service."
  value       = aws_ecs_service.app.name
}

output "ecs_task_definition_arn" {
  description = "ARN of the ECS task definition in use."
  value       = aws_ecs_task_definition.app.arn
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer."
  value       = aws_lb.app.dns_name
}

output "app_url" {
  description = "Public HTTPS URL for the ECS service."
  value       = "https://${aws_lb.app.dns_name}"
}

output "custom_domain_url" {
  description = "Public HTTPS URL for the custom Route 53 domain, when configured."
  value       = var.route53_record_name != null && var.route53_record_name != "" ? "https://${var.route53_record_name}" : null
}

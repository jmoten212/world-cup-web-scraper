locals {
  ecs_name_prefix = "${var.project_name}-${var.environment}"
  ecs_vpc_id      = var.vpc_id != "" ? var.vpc_id : data.aws_vpc.default[0].id
  ecs_subnet_ids  = length(var.subnet_ids) > 0 ? var.subnet_ids : data.aws_subnets.selected[0].ids
  ecs_image       = "${aws_ecr_repository.app.repository_url}:${var.container_image_tag}"
}

data "aws_vpc" "default" {
  count   = var.vpc_id == "" ? 1 : 0
  default = true
}

data "aws_subnets" "selected" {
  count = length(var.subnet_ids) == 0 ? 1 : 0

  filter {
    name   = "vpc-id"
    values = [local.ecs_vpc_id]
  }
}

resource "aws_cloudwatch_log_group" "ecs" {
  #checkov:skip=CKV_AWS_338:Retention period is intentionally configurable via var.ecs_log_retention_days
  #checkov:skip=CKV_AWS_158:Default encryption is sufficient; KMS CMK adds cost and complexity for this project
  name              = "/ecs/${local.ecs_name_prefix}"
  retention_in_days = var.ecs_log_retention_days
}

resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.ecs_name_prefix}-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name = "${local.ecs_name_prefix}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_security_group" "alb" {
  #checkov:skip=CKV_AWS_260:ALB is intentionally public-facing on HTTPS only
  #checkov:skip=CKV_AWS_382:Unrestricted outbound is required for ALB health checks and routing
  name        = "${local.ecs_name_prefix}-alb"
  description = "ALB security group"
  vpc_id      = local.ecs_vpc_id

  ingress {
    description = "Allow HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.alb_ingress_cidr_blocks
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs_service" {
  #checkov:skip=CKV_AWS_382:Unrestricted outbound required for ECS tasks to reach ECR, CloudWatch, and RDS
  name        = "${local.ecs_name_prefix}-ecs-service"
  description = "ECS service security group"
  vpc_id      = local.ecs_vpc_id

  ingress {
    description     = "Allow traffic from ALB to app port"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "app" {
  #checkov:skip=CKV_AWS_150:Deletion protection disabled intentionally to allow terraform destroy
  #checkov:skip=CKV_AWS_91:ALB access logging requires a dedicated S3 bucket; not warranted for this project
  #checkov:skip=CKV2_AWS_28:WAF is not part of this project's current infrastructure scope
  name                       = substr("${local.ecs_name_prefix}-alb", 0, 32)
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = local.ecs_subnet_ids
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "app" {
  #checkov:skip=CKV_AWS_378:This app does not terminate TLS; ALB-to-service traffic remains HTTP by design
  name        = substr("${local.ecs_name_prefix}-tg", 0, 32)
  port        = var.app_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = local.ecs_vpc_id

  health_check {
    enabled             = true
    path                = var.health_check_path
    protocol            = "HTTP"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

resource "aws_ecs_cluster" "app" {
  #checkov:skip=CKV_AWS_65:Container insights adds CloudWatch cost; not required for this project
  name = "${local.ecs_name_prefix}-cluster"
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${local.ecs_name_prefix}-task"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.ecs_task_cpu)
  memory                   = tostring(var.ecs_task_memory)
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    cpu_architecture        = var.ecs_runtime_cpu_architecture
    operating_system_family = var.ecs_runtime_os_family
  }

  container_definitions = jsonencode([
    {
      name      = "app"
      image     = local.ecs_image
      essential = true
      portMappings = [
        {
          containerPort = var.app_port
          hostPort      = var.app_port
          protocol      = "tcp"
        }
      ]
      environment = [
        {
          name  = "PORT"
          value = tostring(var.app_port)
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "app" {
  #checkov:skip=CKV_AWS_333:Public IP assignment is controlled by var.assign_public_ip; required when using default VPC without NAT gateway
  name            = "${local.ecs_name_prefix}-service"
  cluster         = aws_ecs_cluster.app.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    assign_public_ip = var.assign_public_ip
    security_groups  = [aws_security_group.ecs_service.id]
    subnets          = local.ecs_subnet_ids
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = var.app_port
  }

  depends_on = [aws_lb_listener.https]
}

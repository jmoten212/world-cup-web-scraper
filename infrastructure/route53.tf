locals {
  enable_route53_records = var.route53_zone_id != null && var.route53_zone_id != "" && var.route53_record_name != null && var.route53_record_name != ""
}

resource "aws_route53_record" "app_a" {
  count   = local.enable_route53_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.route53_record_name
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "app_aaaa" {
  count   = local.enable_route53_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.route53_record_name
  type    = "AAAA"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}
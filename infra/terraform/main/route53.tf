# API Gateway domain configuration

locals {
  # Define API domain
  api_domain = var.environment == "prod" ? "api.${var.domain}" : "api-dev.${var.domain}"
}

# Create Route53 zone for API domain
resource "aws_route53_zone" "api_zone" {
  name = local.api_domain

  tags = {
    Name        = "JailData API Zone"
    Environment = var.environment
    Service     = "JailData"
  }
}

# Create certificate for API domain
resource "aws_acm_certificate" "api_cert" {
  domain_name       = local.api_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "JailData API Certificate"
    Environment = var.environment
    Service     = "JailData"
  }
}

# Create DNS validation records for the API certificate
resource "aws_route53_record" "api_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api_cert.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = aws_route53_zone.api_zone.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
}

# Wait for certificate validation
resource "aws_acm_certificate_validation" "api_cert_validation" {
  certificate_arn         = aws_acm_certificate.api_cert.arn
  validation_record_fqdns = [for record in aws_route53_record.api_cert_validation : record.fqdn]

  timeouts {
    create = "5m"
  }
}

# Create API Gateway domain name
resource "aws_api_gateway_domain_name" "api_gateway_domain" {
  depends_on              = [aws_acm_certificate_validation.api_cert_validation]
  domain_name             = local.api_domain
  regional_certificate_arn = aws_acm_certificate.api_cert.arn

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = {
    Name        = "JailData API Gateway Domain"
    Environment = var.environment
    Service     = "JailData"
  }
}

# Create DNS record for API Gateway
resource "aws_route53_record" "api_gateway_record" {
  zone_id = aws_route53_zone.api_zone.zone_id
  name    = local.api_domain
  type    = "A"

  alias {
    name                   = aws_api_gateway_domain_name.api_gateway_domain.regional_domain_name
    zone_id                = aws_api_gateway_domain_name.api_gateway_domain.regional_zone_id
    evaluate_target_health = false
  }
}
resource "aws_ssm_parameter" "jail_data_base_url" {
  name        = "/jaildata/base-url"
  type        = "String"
  value       = "CHANGE_ME"
  description = "Base URL for external jail data API endpoints (set manually after deployment)"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "buncombe_api_id" {
  name        = "/jaildata/facilities/buncombe/api-id"
  type        = "String"
  value       = "CHANGE_ME"
  description = "API ID for Buncombe County jail data system (set manually after deployment)"

  lifecycle {
    ignore_changes = [value]
  }
}

# API Gateway domain outputs
output "ApiDomain" {
  description = "API Gateway custom domain name"
  value       = aws_api_gateway_domain_name.api_gateway_domain.domain_name
}

output "ApiZoneId" {
  description = "Route53 zone ID for API domain"  
  value       = aws_route53_zone.api_zone.zone_id
}
# API Gateway domain outputs
output "ApiDomain" {
  description = "API Gateway custom domain name"
  value       = aws_api_gateway_domain_name.api_gateway_domain.domain_name
}

output "ApiZoneId" {
  description = "Route53 zone ID for API domain"  
  value       = aws_route53_zone.api_zone.zone_id
}
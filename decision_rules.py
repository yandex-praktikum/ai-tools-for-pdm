ALLOWED_ROUTES = {
	"RECOMMEND_APPROVE",
	"RECOMMEND_DENY",
	"NEED_MORE_INFORMATION",
	"MANUAL_REVIEW",
	"DUPLICATE_OR_PROCESSED",
}


def validate_route(route):
	if route not in ALLOWED_ROUTES:
		raise ValueError("Недопустимый маршрут обработки")
	return route


def requires_manager_confirmation(route):
	validate_route(route)
	return True

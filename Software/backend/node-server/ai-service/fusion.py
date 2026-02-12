def fuse_results(vibration_result, vision_result):
    vib_score = vibration_result.get("score", 0)
    vis_score = vision_result.get("vision_confidence", 0)

    final_score = 0.6 * vib_score + 0.4 * vis_score

    if vib_score > 0.7 and vis_score > 0.5:
        severity = "CRITICAL"
    elif final_score > 0.6:
        severity = "HIGH"
    elif final_score > 0.3:
        severity = "MEDIUM"
    else:
        severity = "LOW"

    return {
        "final_alert": final_score > 0.5,
        "final_score": round(final_score, 3),
        "severity": severity
    }
